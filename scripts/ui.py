#!/usr/bin/env python3
"""Mini-Helfer für Emulator-Tests: tippt auf ein Element anhand seines Texts.
Aufruf: ui.py tap "<regex>" [--last]   |   ui.py exists "<regex>"   |   ui.py dump"""
import re, subprocess, sys, time
import xml.etree.ElementTree as ET

def dump():
    subprocess.run(["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"], capture_output=True)
    xml = subprocess.run(["adb", "exec-out", "cat", "/sdcard/ui.xml"], capture_output=True, text=True).stdout
    try:
        return ET.fromstring(xml)
    except ET.ParseError:
        return None

def find(pattern):
    root = dump()
    if root is None:
        return []
    rx = re.compile(pattern)
    hits = []
    for n in root.iter("node"):
        label = " ".join(filter(None, [n.get("text"), n.get("content-desc"), n.get("hint")]))
        if label and rx.search(label):
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.get("bounds", ""))
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                hits.append(((x1 + x2) // 2, (y1 + y2) // 2, label))
    return sorted(hits, key=lambda h: h[1])

cmd, pattern = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "")
if cmd == "dump":
    root = dump()
    for n in (root.iter("node") if root is not None else []):
        label = " | ".join(filter(None, [n.get("text"), n.get("content-desc"), n.get("hint")]))
        if label:
            print(n.get("bounds"), label)
    sys.exit(0)
for _ in range(10):
    hits = find(pattern)
    if hits:
        break
    time.sleep(2)
if cmd == "exists":
    sys.exit(0 if hits else 1)
if not hits:
    print(f"UI: nicht gefunden: {pattern}")
    sys.exit(1)
x, y, label = hits[-1] if "--last" in sys.argv else hits[0]
print(f"UI: tippe auf '{label}' ({x},{y})")
subprocess.run(["adb", "shell", "input", "tap", str(x), str(y)])
