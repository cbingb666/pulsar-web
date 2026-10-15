"""Read-only HID inventory for development; never modifies device settings."""
import ctypes as c
import json
from pathlib import Path

class Info(c.Structure):
    pass
Info._fields_ = [("path", c.c_char_p), ("vendor_id", c.c_ushort), ("product_id", c.c_ushort),
                 ("serial_number", c.c_wchar_p), ("release_number", c.c_ushort),
                 ("manufacturer_string", c.c_wchar_p), ("product_string", c.c_wchar_p),
                 ("usage_page", c.c_ushort), ("usage", c.c_ushort), ("interface_number", c.c_int),
                 ("next", c.POINTER(Info)), ("bus_type", c.c_int)]
lib = c.CDLL('/opt/homebrew/lib/libhidapi.dylib')
lib.hid_enumerate.argtypes = [c.c_ushort, c.c_ushort]
lib.hid_enumerate.restype = c.POINTER(Info)
lib.hid_free_enumeration.argtypes = [c.POINTER(Info)]
def enumerate_devices(product_id=0x3401):
    head = lib.hid_enumerate(0x3710, product_id)
    p = head
    result = []
    try:
        while p:
            v = p.contents
            result.append(dict(path=v.path.decode(), vendor_id=v.vendor_id, product_id=v.product_id,
                               product=v.product_string, usage_page=v.usage_page, usage=v.usage,
                               interface_number=v.interface_number))
            p = v.next
    finally:
        lib.hid_free_enumeration(head)
    return result

# Keep the original wired diagnostics compatible; the CLI lists all Pulsar devices.
rows = enumerate_devices()
if __name__ == '__main__': print(json.dumps(enumerate_devices(0), indent=2))
