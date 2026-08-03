# Feature tour demos

Place short looping screen recordings here. The home-page showcase looks for
these filenames automatically:

| File | Feature |
|------|---------|
| `least-listened.webm` | Least listened dashboard |
| `fair-shuffle.webm` | Fair / weighted / deck shuffle |
| `playlist-sort.webm` | Gemini playlist sort |
| `recently-deleted.webm` | Restore from recently deleted |
| `playlists.webm` | Playlist preferences / intents |

Tips:

- Prefer **WebM** or **MP4**, 3–8 seconds, muted, no UI chrome from the recorder.
- GIF also works if you point `demoSrc` at it in `src/app/page.tsx`.
- Keep resolution around 1280×800 or 1600×1000.
- Until a file exists (or if it fails to load), the UI shows a styled placeholder.

Optional posters: `least-listened.jpg`, etc., if you later wire `posterSrc`.
