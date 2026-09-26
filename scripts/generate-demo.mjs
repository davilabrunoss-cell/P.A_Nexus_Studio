import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
// Regenera apenas o clipe demonstrativo; não processa os vídeos da produtora.
const result = spawnSync(
  ffmpeg,
  [
    "-y",
    "-loop",
    "1",
    "-i",
    "public/assets/aurora.png",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-vf",
    "scale=1920:-1,zoompan=z='min(zoom+0.00035,1.12)':d=360:s=1280x720:fps=30,fade=t=in:st=0:d=1,fade=t=out:st=11:d=1",
    "-t",
    "12",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    "public/assets/demo.mp4",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
