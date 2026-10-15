"""Read Sonix settings from the Xlite v4 via hidapi; read commands only.
Diagnostic development tool. Browser app uses WebHID directly.
"""
import ctypes as c
import importlib.util
import json
import time
from pathlib import Path
spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('hid-inspect.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
lib = module.lib
lib.hid_open_path.argtypes = [c.c_char_p]
lib.hid_open_path.restype = c.c_void_p
lib.hid_close.argtypes = [c.c_void_p]
lib.hid_send_feature_report.argtypes = [c.c_void_p, c.c_void_p, c.c_size_t]
lib.hid_get_feature_report.argtypes = [c.c_void_p, c.c_void_p, c.c_size_t]
lib.hid_error.argtypes = [c.c_void_p]
lib.hid_error.restype = c.c_wchar_p
lib.hid_darwin_set_open_exclusive(0)
path = next(r['path'] for r in module.rows if r['interface_number'] == 3)
h = lib.hid_open_path(path.encode())
if not h: raise RuntimeError(lib.hid_error(None))
def read(cat, reg, sub, profile=0, payload=()):
    b=bytearray(64); b[1:4]=bytes([cat,reg|0x80,sub]); b[6]=profile; b[7:7+len(payload)]=bytes(payload)
    b[62:64]=sum(b[:62]).to_bytes(2,'little')
    raw=(c.c_ubyte*65).from_buffer_copy(b'\0'+b)
    n=lib.hid_send_feature_report(h,raw,65)
    if n < 0:raise RuntimeError(lib.hid_error(h))
    for _ in range(12):
        time.sleep(.03)
        buf=(c.c_ubyte*65)(); n=lib.hid_get_feature_report(h,buf,65)
        if n<0: raise RuntimeError(lib.hid_error(h))
        res=bytes(buf)[1:n]
        if res and res[0]==1: return {'request':b.hex(),'response':res.hex(), 'length':len(res)}
    raise RuntimeError(f'No response: {bytes(buf).hex()}')
try:
    out={}
    for name,args in {'polling':(1,9,2),'debounce':(4,3,3),'angleSnap':(7,4,2),'ripple':(7,3,2),'motionSync':(7,5,2),'lod':(7,2,3,1),'dpi':(5,4,0x15,1),'activeStage':(5,1,2,1),'profiles':(2,2,0x10),'activeProfile':(2,6,1),'macroCount':(6,1,1),'macroList':(6,2,0x38),'firmware':(1,7,4),'brightness':(3,3,3,1,[1]),'led':(3,4,15,1,[1]),'battery':(8,1,1),'charging':(8,3,1),'sleep':(8,5,3),'lowPower':(8,8,2),**{f'button{b}':(4,1,6,1,[b,255]) for b in [1,2,3,4,5,11]},**{f'color{b}':(5,5,5,1,[b]) for b in range(1,7)}}.items():
        try:out[name]=read(*args)
        except Exception as e:out[name]={'error':str(e)}
    Path('.local/device-read.json').write_text(json.dumps(out,indent=2))
    print(json.dumps(out,indent=2))
finally:lib.hid_close(h)
