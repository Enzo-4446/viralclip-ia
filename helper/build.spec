# Build on each target operating system; FFmpeg must be installed in PATH.
import os
import shutil
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

binaries = []
for name in ("ffmpeg", "ffprobe"):
    executable = shutil.which(name)
    if executable:
        binaries.append((executable, "."))
a = Analysis(["helper.py"], pathex=[str(Path.cwd())], binaries=binaries, datas=[], hiddenimports=collect_submodules("yt_dlp"), hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=[], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="ViralIA-Helper", debug=False, strip=False, upx=False, console=True)
