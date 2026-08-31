import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const configDir = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(configDir, "package.json"), "utf8")) as { version: string };

const nextConfig: NextConfig = {
  outputFileTracingRoot: configDir,
  // 地基阶段暂不需要外部包；后续接入 pi SDK 时在此追加：
  // serverExternalPackages: ["@earendil-works/pi-coding-agent", "cordis"],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
