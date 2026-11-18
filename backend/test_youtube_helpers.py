import importlib.util
from pathlib import Path

def load_youtube_helpers():
    source=Path(__file__).with_name("app.py").read_text()
    start=source.index("def youtube_pot_args():")
    end=source.index('\n@app.post("/clips/youtube")',start)
    scope={"os":__import__("os")}
    exec(source[start:end],scope)
    return scope

def test_verification_error_is_not_reported_as_success():
    helpers=load_youtube_helpers()
    assert helpers["youtube_error_kind"]("Sign in to confirm you're not a bot")=="verification_required"
    assert "MP4" in helpers["youtube_error_message"]("Sign in to confirm you're not a bot")

def test_rate_limit_and_private_video():
    helpers=load_youtube_helpers()
    assert helpers["youtube_error_kind"]("HTTP Error 429")=="rate_limited"
    assert helpers["youtube_error_kind"]("Private video")=="restricted"

def test_download_command_is_bounded_and_no_playlist():
    helpers=load_youtube_helpers()
    command=helpers["youtube_download_command"]("https://www.youtube.com/watch?v=abcdefghijk","/tmp/test.%(ext)s")
    assert "--no-playlist" in command
    assert "--max-filesize" in command
    assert command[-1]=="https://www.youtube.com/watch?v=abcdefghijk"
    assert "--merge-output-format" in command
