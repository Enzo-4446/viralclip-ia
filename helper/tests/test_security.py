import pytest
from security import canonical_youtube_url

@pytest.mark.parametrize("value", [
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://youtu.be/abcdefghijk",
    "https://m.youtube.com/shorts/abcdefghijk",
])
def test_valid(value):
    assert canonical_youtube_url(value) == "https://www.youtube.com/watch?v=abcdefghijk"

@pytest.mark.parametrize("value", [
    "http://youtube.com/watch?v=abcdefghijk",
    "https://youtube.com.evil.com/watch?v=abcdefghijk",
    "file:///etc/passwd", "javascript:alert(1)",
    "https://www.youtube.com/playlist?list=abcdefghijk",
    "https://www.youtube.com/watch?v=abcdefghijk&list=123",
    "https://www.youtube.com/watch?v=bad",
    "https://youtu.be/abcdefghijk;rm -rf",
])
def test_invalid(value):
    with pytest.raises(ValueError):
        canonical_youtube_url(value)
