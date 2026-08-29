# tools/convert_audio.py — 把 elysia 目录下所有 *.wma 转成 audio/*.mp3（128k）
import os, subprocess, sys, glob
sys.stdout.reconfigure(encoding='utf-8')
import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # D:\claude-code\elysia
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
AUDIO = os.path.join(ROOT, 'audio')
os.makedirs(AUDIO, exist_ok=True)

wm = sorted(glob.glob(os.path.join(ROOT, '*.wma')))
print(f'found {len(wm)} wma files')
for src in wm:
    base = os.path.splitext(os.path.basename(src))[0]
    dst = os.path.join(AUDIO, base + '.mp3')
    r = subprocess.run([FFMPEG, '-y', '-i', src, '-c:a', 'libmp3lame', '-b:a', '128k', dst],
                       capture_output=True)
    if r.returncode == 0:
        print(f'OK  {os.path.basename(src)} -> {os.path.basename(dst)} ({os.path.getsize(dst)}B)')
    else:
        print(f'FAIL {os.path.basename(src)}')
        print(r.stderr.decode('utf-8', errors='ignore')[-300:])