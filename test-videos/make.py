#!/usr/bin/env python3
"""시연용 테스트 영상 생성기: scripts.json 대본 → macOS TTS 음성 + 문장별 자막 슬라이드 → mp4 + .srt.
남의 영상을 퍼오지 않고(저작권) 게시 대상 영상을 직접 만들기 위한 스크립트. 의존성: macOS `say`, ffmpeg, Google Chrome.
사용: python3 make.py [scripts.json] [출력폴더]"""
import html
import json
import subprocess
import sys
from pathlib import Path

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
VOICE = "Yuna"
W, H = 1280, 720

SLIDE = """<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;width:{w}px;height:{h}px;background:#1b1426;overflow:hidden}}
body{{display:flex;flex-direction:column;justify-content:center;padding:0 110px;box-sizing:border-box;
font-family:'Apple SD Gothic Neo',sans-serif;color:#f5eefc}}
.t{{font-size:26px;color:#c9a7ff;margin-bottom:36px;font-weight:600}}
.l{{font-size:52px;line-height:1.45;font-weight:700;word-break:keep-all}}
.n{{position:absolute;bottom:40px;right:60px;font-size:22px;color:#7d6a92}}
</style><div class="t">{title}</div><div class="l">{line}</div><div class="n">{idx}</div>"""


def run(*cmd: str) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def duration(path: Path) -> float:
    return float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)))


def srt_time(sec: float) -> str:
    ms = round(sec * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def make_video(video: dict, out_root: Path) -> None:
    work = out_root / video["slug"]
    work.mkdir(parents=True, exist_ok=True)
    segments, srt, t = [], [], 0.0
    lines = video["lines"]

    for i, line in enumerate(lines, 1):
        audio, slide_html, slide_png, seg = (work / f"{i:02}{ext}" for ext in (".aiff", ".html", ".png", ".mp4"))
        run("say", "-v", VOICE, "-o", str(audio), line)
        slide_html.write_text(
            SLIDE.format(w=W, h=H, title=html.escape(video["title"]), line=html.escape(line), idx=f"{i}/{len(lines)}"),
            encoding="utf-8",
        )
        run(CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={W},{H}",
            f"--screenshot={slide_png}", slide_html.as_uri())
        # 문장 끝에 0.4초 여백을 둬서 슬라이드가 음성보다 먼저 넘어가지 않게 함
        run("ffmpeg", "-y", "-loop", "1", "-i", str(slide_png), "-i", str(audio),
            "-af", "apad=pad_dur=0.4", "-c:v", "libx264", "-tune", "stillimage", "-r", "30",
            "-c:a", "aac", "-ar", "44100", "-pix_fmt", "yuv420p", "-shortest", str(seg))
        d = duration(seg)
        srt.append(f"{i}\n{srt_time(t)} --> {srt_time(t + d)}\n{line}\n")
        t += d
        segments.append(seg)

    concat = work / "concat.txt"
    concat.write_text("".join(f"file '{s.name}'\n" for s in segments), encoding="utf-8")
    final = out_root / f"{video['slug']}.mp4"
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(final))
    (out_root / f"{video['slug']}.srt").write_text("\n".join(srt), encoding="utf-8")
    (out_root / f"{video['slug']}.txt").write_text(f"제목: {video['title']}\n\n설명:\n{video['description']}\n", encoding="utf-8")
    print(f"{final.name}  {t:.1f}s  ({len(lines)}문장)")


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    scripts = Path(sys.argv[1]) if len(sys.argv) > 1 else here / "scripts.json"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else here / "out"
    for v in json.loads(scripts.read_text(encoding="utf-8")):
        make_video(v, out)
