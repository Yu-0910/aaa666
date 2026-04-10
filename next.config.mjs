import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `process.cwd()` がズレても `_data` を確実に辿る（lib/projectRoot.ts）
  env: {
    TOPPAGE_PROJECT_ROOT: __dirname,
  },
  // 複数 lockfile 警告を解消（プロジェクトルートを明示）
  outputFileTracingRoot: path.join(__dirname),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.nikkansports.com',
      },
    ],
  },
  // 二重構造を防ぐための設定
  reactStrictMode: true,
  // OneDriveの日本語パス問題を回避するため、experimental設定を追加
  experimental: {
    // シンボリックリンクの問題を回避
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // 出力先を明示的に設定（OneDriveの同期問題を回避）
  distDir: '.next',
}

export default nextConfig
