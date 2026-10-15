#!/usr/bin/env python3
"""JSON-lines native adapter for testing the real TypeScript WebHID client.

Default permits read commands only. --write-test permits only macro storage,
profile selection, sleep/low-power settings, ripple control and button bindings. Reset, firmware,
pairing and all other write categories are always rejected. No packet encoding
or response parsing is implemented here; src/hid.ts owns the protocol.
"""
import argparse
import ctypes as c
import importlib.util
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--write-test', action='store_true')
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('hid_inventory', Path(__file__).with_name('hid-inspect.py'))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)
lib = inventory.lib
lib.hid_open_path.argtypes = [c.c_char_p]
lib.hid_open_path.restype = c.c_void_p
lib.hid_close.argtypes = [c.c_void_p]
lib.hid_send_feature_report.argtypes = [c.c_void_p, c.c_void_p, c.c_size_t]
lib.hid_send_feature_report.restype = c.c_int
lib.hid_get_feature_report.argtypes = [c.c_void_p, c.c_void_p, c.c_size_t]
lib.hid_get_feature_report.restype = c.c_int
lib.hid_error.argtypes = [c.c_void_p]
lib.hid_error.restype = c.c_wchar_p
lib.hid_darwin_set_open_exclusive(0)
handle = None
allowed_writes = {(6, 3), (6, 4), (6, 5), (6, 6), (2, 6), (8, 5), (8, 8), (4, 1), (7, 3)}


def operate(message):
    global handle
    command = message.get('command')
    if command == 'open':
        if handle:
            return {'opened': True}
        candidates = [row for row in inventory.rows if row['vendor_id'] == 0x3710
                      and row['product_id'] == 0x3401 and row['interface_number'] == 3]
        if len(candidates) != 1:
            raise RuntimeError(f'Expected one 3710:3401 interface 3; found {len(candidates)}')
        handle = lib.hid_open_path(candidates[0]['path'].encode())
        if not handle:
            raise RuntimeError(lib.hid_error(None) or 'Cannot open wired Xlite V4')
        return {'opened': True, 'device': candidates[0]}
    if command == 'close':
        if handle:
            lib.hid_close(handle)
            handle = None
        return {'opened': False}
    if not handle:
        raise RuntimeError('Device is not open')
    if command == 'send':
        values = message.get('data')
        if not isinstance(values, list) or len(values) != 64 or any(type(value) is not int or not 0 <= value <= 255 for value in values):
            raise ValueError('Expected exactly 64 payload bytes')
        packet = bytes(values)
        if packet[0] != 0 or int.from_bytes(packet[62:64], 'little') != sum(packet[:62]) & 0xffff:
            raise ValueError('Invalid command direction/checksum')
        if not packet[2] & 0x80:
            if not args.write_test:
                raise RuntimeError('Read-only bridge: --write-test is required')
            if (packet[1], packet[2]) not in allowed_writes:
                raise RuntimeError('Write is outside the smoke-test allowlist')
            if (packet[1], packet[2]) == (4, 1) and packet[7] != 5:
                raise RuntimeError('Smoke test may only remap side button 5')
        raw = (c.c_ubyte * 65).from_buffer_copy(b'\0' + packet)
        count = lib.hid_send_feature_report(handle, raw, 65)
        if count != 65:
            raise RuntimeError(lib.hid_error(handle) or f'Feature send returned {count}')
        return {'sent': 64}
    if command == 'receive':
        raw = (c.c_ubyte * 65)()
        count = lib.hid_get_feature_report(handle, raw, 65)
        if count < 0:
            raise RuntimeError(lib.hid_error(handle) or 'Feature receive failed')
        # hidapi includes report ID 0; WebHID excludes it for unnumbered reports.
        return {'data': list(bytes(raw)[1:count])}
    raise ValueError('Unknown bridge command')


try:
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            result = {'id': request.get('id'), 'ok': True, 'result': operate(request)}
        except Exception as error:
            result = {'id': request.get('id'), 'ok': False, 'error': str(error)}
        print(json.dumps(result), flush=True)
finally:
    if handle:
        lib.hid_close(handle)
