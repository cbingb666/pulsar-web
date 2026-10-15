#!/usr/bin/env python3
"""Back up/read the Xlite V4; reversible settings writes require --write-test.

This is an optional macOS/hidapi development check, not a web-app dependency.
No Windows code is executed. Macros, resets, firmware and pairing are excluded.
Close other configuration clients before running. A cable disconnect or SIGKILL
can prevent restoration; the durable backup contains the original raw packets.
"""
import argparse
import ctypes as c
import importlib.util
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '.local'
TEST_NAMES = ('dpi', 'polling', 'debounce', 'ripple', 'lod', 'led', 'color', 'button5')


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def durable_json(path, value):
    """Replace the evidence file only after its complete contents are synced."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    with temp.open('w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temp.replace(path)


def packet(group, opcode, length, profile=0, payload=()):
    values = [group, opcode, length, profile, *payload]
    if any(not isinstance(value, int) or not 0 <= value <= 255 for value in values):
        raise ValueError('Invalid packet byte')
    if len(payload) > 55:
        raise ValueError('Payload too long')
    data = bytearray(64)
    data[1:4] = bytes((group, opcode, length))
    data[6] = profile
    data[7:7 + len(payload)] = bytes(payload)
    return seal(data)


def seal(data):
    data = bytearray(data)
    if len(data) != 64:
        raise ValueError('Expected a 64-byte payload')
    data[62:64] = (sum(data[:62]) & 0xffff).to_bytes(2, 'little')
    return bytes(data)


def as_write(response, profile):
    """Preserve the complete returned settings block, including unknown bytes."""
    data = bytearray(response)
    data[0] = 0
    data[2] &= 0x7f
    data[6] = profile
    return seal(data)


class Client:
    def __init__(self, audit, persist):
        spec = importlib.util.spec_from_file_location('hid_inventory', ROOT / 'scripts/hid-inspect.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        candidates = [row for row in module.rows if row['vendor_id'] == 0x3710
                      and row['product_id'] == 0x3401 and row['interface_number'] == 3]
        if len(candidates) != 1:
            raise RuntimeError(f'Expected exactly one wired Xlite V4 interface 3; found {len(candidates)}')
        self.device = candidates[0]
        self.lib = module.lib
        self.lib.hid_open_path.argtypes = [c.c_char_p]
        self.lib.hid_open_path.restype = c.c_void_p
        self.lib.hid_close.argtypes = [c.c_void_p]
        self.lib.hid_send_feature_report.argtypes = [c.c_void_p, c.c_void_p, c.c_size_t]
        self.lib.hid_send_feature_report.restype = c.c_int
        self.lib.hid_get_feature_report.argtypes = [c.c_void_p, c.c_void_p, c.c_size_t]
        self.lib.hid_get_feature_report.restype = c.c_int
        self.lib.hid_error.argtypes = [c.c_void_p]
        self.lib.hid_error.restype = c.c_wchar_p
        self.lib.hid_darwin_set_open_exclusive(0)
        self.handle = self.lib.hid_open_path(self.device['path'].encode())
        if not self.handle:
            raise RuntimeError(self.lib.hid_error(None) or 'Cannot open Xlite V4')
        self.audit, self.persist = audit, persist
        self.write_enabled = False
        self.phase = 'backup'

    def close(self):
        if self.handle:
            self.lib.hid_close(self.handle)
            self.handle = None

    def transact(self, request, echo=None):
        request = bytes(request)
        mutation = not bool(request[2] & 0x80)
        if mutation and not self.write_enabled:
            raise RuntimeError('Settings writes are disabled; --write-test is required')
        entry = {'time': utc_now(), 'phase': self.phase, 'mutation': mutation,
                 'request': request.hex(), 'responses': []}
        self.audit['transactions'].append(entry)
        self.persist()  # Intent is durable before a settings write can occur.
        raw = (c.c_ubyte * 65).from_buffer_copy(b'\0' + request)
        sent = self.lib.hid_send_feature_report(self.handle, raw, 65)
        if sent != 65:
            raise RuntimeError(self.lib.hid_error(self.handle) or f'Feature send returned {sent}')
        for _ in range(40):
            time.sleep(.03)
            raw_response = (c.c_ubyte * 65)()
            size = self.lib.hid_get_feature_report(self.handle, raw_response, 65)
            if size < 0:
                raise RuntimeError(self.lib.hid_error(self.handle) or 'Feature read failed')
            response = bytes(raw_response)[1:size]
            entry['responses'].append(response.hex())
            if len(response) != 64 or response[1:3] != request[1:3]:
                continue
            if int.from_bytes(response[62:64], 'little') != sum(response[:62]) & 0xffff:
                raise RuntimeError('Device response checksum mismatch')
            if response[0] in (2, 3, 4, 5):
                raise RuntimeError(f'Device rejected {request[1]:02x}:{request[2]:02x}: status {response[0]}')
            if response[0] != 1:
                continue
            if request[6] and response[6] != request[6]:
                continue
            if echo is not None and response[7] != echo:
                continue
            entry['accepted'] = response.hex()
            self.persist()
            return response
        raise RuntimeError(f'Timed out waiting for {request[1]:02x}:{request[2]:02x}')

    def read(self, group, register, length, profile=0, payload=(), echo=None):
        return self.transact(packet(group, register | 0x80, length, profile, payload), echo)


def read_snapshot(client, profile):
    commands = {
        'activeProfile': (2, 6, 1), 'activeStage': (5, 1, 2, profile),
        'polling': (1, 9, 2), 'debounce': (4, 3, 3),
        'ripple': (7, 3, 2), 'angleSnap': (7, 4, 2), 'motionSync': (7, 5, 2),
        'lod': (7, 2, 3, profile), 'dpi': (5, 4, 0x15, profile),
        'brightness': (3, 3, 3, profile, [1], 1),
        'led': (3, 4, 15, profile, [1], 1),
        'sleep': (8, 5, 3), 'lowPower': (8, 8, 2),
    }
    commands.update({f'button{key}': (4, 1, 6, profile, [key, 255], key)
                     for key in (1, 2, 3, 4, 5, 11)})
    commands.update({f'color{stage}': (5, 5, 5, profile, [stage], stage) for stage in range(1, 7)})
    return {name: client.read(*args) for name, args in commands.items()}


def comparable(snapshot):
    # Strip packet status/header/checksum; compare all settings bytes, including
    # unknown/trailing fields, rather than only the one visible test value.
    return {name: response[6:62].hex() for name, response in snapshot.items()}


def make_plan(snapshot, profile):
    dpi = snapshot['dpi']
    active, count = dpi[7], dpi[8]
    if not 1 <= active <= count <= 6:
        raise RuntimeError('Invalid DPI stage data; refusing to build write plan')
    for index in range(count):
        offset = 9 + 5 * index
        if dpi[offset] != index + 1:
            raise RuntimeError('Unexpected DPI stage layout')
        for axis in (offset + 1, offset + 3):
            if not 50 <= int.from_bytes(dpi[axis:axis + 2], 'little') <= 32000:
                raise RuntimeError('Unexpected DPI value')
    if snapshot['lod'][7] != 2 or snapshot['lod'][8] not in (7, 10, 20):
        raise RuntimeError('Unexpected V4 LOD encoding')
    if snapshot['polling'][7] not in (1, 2, 4, 8):
        raise RuntimeError('Unexpected wired polling rate')
    if snapshot['debounce'][7] > 15 or snapshot['ripple'][7] not in (0, 1):
        raise RuntimeError('Unexpected debounce or ripple data')
    if snapshot['led'][8] > 2:
        raise RuntimeError('Unexpected LED effect')
    plans = []

    def add(name, key, read_args, edits, detail, native_payload=None, check_offsets=None):
        original = snapshot[key]
        restore = as_write(original, original[6])
        changed = bytearray(restore)
        for offset, value in edits.items():
            changed[offset] = value
        if native_payload is not None:
            changed[7:7 + len(native_payload)] = bytes(native_payload)
        expected = bytearray(original)
        for offset, value in edits.items():
            expected[offset] = value
        plans.append({'name': name, 'key': key, 'readArgs': read_args,
                      'detail': detail, 'write': seal(changed).hex(),
                      'restore': restore.hex(), 'original': original.hex(),
                      'expected': bytes(expected).hex(),
                      'checkOffsets': check_offsets or list(range(7, 62))})

    off_stage = next((stage for stage in range(1, count + 1) if stage != active), None)
    if off_stage is not None:
        offset = 10 + 5 * (off_stage - 1)
        old = int.from_bytes(dpi[offset:offset + 2], 'little')
        new = old + 10 if old < 32000 else old - 10
        add('dpi', 'dpi', (5, 4, 0x15, profile),
            {offset: new & 255, offset + 1: new >> 8},
            f'Inactive stage {off_stage} X DPI {old} -> {new}; active stage {active} unchanged')
    else:
        plans.append({'name': 'dpi', 'skip': 'Only one DPI stage; no inactive stage available'})

    rate = snapshot['polling'][7]
    new_rate = 4 if rate != 4 else 8
    add('polling', 'polling', (1, 9, 2), {7: new_rate}, f'{rate * 125} -> {new_rate * 125} Hz')
    debounce = snapshot['debounce'][7]
    new_debounce = debounce + 1 if debounce < 15 else 14
    add('debounce', 'debounce', (4, 3, 3), {7: new_debounce},
        f'{debounce} -> {new_debounce} ms using native [ms,0]; restore entire original block',
        native_payload=(new_debounce, 0), check_offsets=[7])
    add('ripple', 'ripple', (7, 3, 2), {7: 1 - snapshot['ripple'][7]}, 'Toggle ripple control')
    new_lod = 7 if snapshot['lod'][8] != 7 else 10
    add('lod', 'lod', (7, 2, 3, profile), {8: new_lod}, f'LOD -> {new_lod / 10} mm')
    new_effect = 1 if snapshot['led'][8] != 1 else 0
    add('led', 'led', (3, 4, 15, profile, [1], 1), {8: new_effect},
        'Toggle off/steady while preserving speed and all unknown LED bytes')
    color_stage = off_stage or active
    color_key = f'color{color_stage}'
    add('color', color_key, (5, 5, 5, profile, [color_stage], color_stage),
        {8: (snapshot[color_key][8] + 1) % 256}, f'Stage {color_stage} red channel +1; preserve green/blue')
    binding = snapshot['button5']
    action = 4 if binding[8:10] == bytes((1, 5)) else 5
    add('button5', 'button5', (4, 1, 6, profile, [5, 255], 5),
        {8: 1, 9: action, 10: 0, 11: 0},
        f'Side button 5 -> {"forward" if action == 5 else "backward"}; primary buttons untouched')
    return plans


def assert_active(client, profile):
    actual = client.read(2, 6, 1)[6]
    if actual != profile:
        raise RuntimeError(f'Active profile changed externally ({profile} -> {actual}); refusing further writes')


def run_one(client, plan, profile, result, persist):
    if 'skip' in plan:
        result.update(status='skipped', reason=plan['skip'])
        persist()
        return
    assert_active(client, profile)
    # The restore path is armed BEFORE the mutation, including an unacknowledged
    # write: a lost ACK does not mean the device failed to apply the setting.
    restore_needed = False
    try:
        client.phase = plan['name'] + ':change'
        restore_needed = True
        result['status'] = 'write-started'
        persist()
        client.transact(bytes.fromhex(plan['write']))
        actual = client.read(*plan['readArgs'])
        expected = bytes.fromhex(plan['expected'])
        mismatches = [offset for offset in plan['checkOffsets'] if actual[offset] != expected[offset]]
        result['changedReadback'] = actual.hex()
        if mismatches:
            raise RuntimeError(f"{plan['name']} readback differs at byte(s) {mismatches}")
        assert_active(client, profile)
        result['status'] = 'change-verified'
        persist()
    finally:
        if restore_needed:
            # One Ctrl-C/TERM initiates cleanup; additional signals must not cut
            # the idempotent restore short. SIGKILL/power loss remains unavoidable.
            old_handlers = {sig: signal.signal(sig, signal.SIG_IGN) for sig in (signal.SIGINT, signal.SIGTERM)}
            try:
                client.phase = plan['name'] + ':restore'
                errors = []
                for attempt in range(1, 4):
                    try:
                        assert_active(client, profile)
                        client.transact(bytes.fromhex(plan['restore']))
                        restored = client.read(*plan['readArgs'])
                        original = bytes.fromhex(plan['original'])
                        if restored[7:62] != original[7:62]:
                            raise RuntimeError('Restored settings block differs from original')
                        result['restoredReadback'] = restored.hex()
                        result['restoreVerified'] = True
                        result['restoreAttempts'] = attempt
                        if result['status'] == 'change-verified':
                            result['status'] = 'passed'
                        break
                    except Exception as error:
                        errors.append(str(error))
                        time.sleep(.1)
                else:
                    result.update(status='RESTORE_FAILED', restoreVerified=False, restoreErrors=errors)
                    persist()
                    raise RuntimeError(f"RESTORE FAILED for {plan['name']}; use durable backup to recover")
            finally:
                persist()
                for sig, handler in old_handlers.items():
                    signal.signal(sig, handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-test', action='store_true', help='Enable explicit temporary settings writes and verified restoration')
    parser.add_argument('--only', nargs='+', choices=TEST_NAMES, help='Run only selected reversible checks')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    lock_path = OUTPUT / 'hardware-smoke.lock'
    try:
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        parser.error(f'Another smoke run may be active; inspect {lock_path} before removing a stale lock')
    os.write(lock_fd, f'{os.getpid()}\n'.encode())
    os.close(lock_fd)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    backup_path = OUTPUT / f'hardware-smoke-backup-{stamp}.json'
    log_path = OUTPUT / 'hardware-smoke.json'
    audit = {'started': utc_now(), 'mode': 'write-test' if args.write_test else 'read-only',
             'backupPath': str(backup_path), 'status': 'starting', 'tests': [], 'transactions': []}
    persist = lambda: durable_json(log_path, audit)
    client = None
    exit_code = 0

    def interrupted(signum, _frame):
        raise KeyboardInterrupt(f'Received signal {signum}')

    old_handlers = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        client = Client(audit, persist)
        audit['device'] = client.device
        profile = client.read(2, 6, 1)[6]
        if not 1 <= profile <= 6:
            raise RuntimeError('Unexpected active profile')
        original = read_snapshot(client, profile)
        if original['activeProfile'][6] != profile:
            raise RuntimeError('Active profile changed during backup')
        plan = make_plan(original, profile)
        if args.only:
            plan = [item for item in plan if item['name'] in args.only]
        backup = {'created': utc_now(), 'device': client.device, 'profile': profile,
                  'responses': {name: data.hex() for name, data in original.items()}, 'plan': plan}
        durable_json(backup_path, backup)
        # Verify the backup can be read before allowing any mutation.
        if json.loads(backup_path.read_text()) != json.loads(json.dumps(backup)):
            raise RuntimeError('Backup verification failed')
        audit.update(profile=profile, status='backed-up', plan=plan)
        persist()
        if not args.write_test:
            audit['status'] = 'read-only-complete'
            print('Read-only backup and plan complete. No settings were changed.')
        else:
            client.write_enabled = True
            for item in plan:
                result = {'name': item['name'], 'status': 'pending'}
                audit['tests'].append(result)
                run_one(client, item, profile, result, persist)
                print(f"{item['name']}: {result['status']}", flush=True)
            client.phase = 'final-readback'
            final = read_snapshot(client, profile)
            before, after = comparable(original), comparable(final)
            changed = [name for name in before if before[name] != after[name]]
            audit['finalResponses'] = {name: data.hex() for name, data in final.items()}
            audit['finalUnchanged'] = not changed
            if changed:
                raise RuntimeError(f'Final snapshot differs from backup: {changed}')
            audit['status'] = 'all-passed-and-restored'
            print('All selected changes verified and restored; final snapshot matches backup.')
    except BaseException as error:
        audit.update(status='failed', error=f'{type(error).__name__}: {error}')
        exit_code = 130 if isinstance(error, KeyboardInterrupt) else 1
        print(audit['error'], file=sys.stderr)
    finally:
        if client:
            client.close()
        audit['finished'] = utc_now()
        persist()
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)
        lock_path.unlink(missing_ok=True)
    print(f'Evidence: {log_path}\nBackup: {backup_path}')
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
