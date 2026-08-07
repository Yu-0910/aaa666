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
  // Vercel ビルド: 歴史 CSV 1 万ファイル超をサーバー関数のトレース対象から除外
  outputFileTracingExcludes: {
    '/*': [
      '_data/master_csv__import_1950_2024/**',
      '_data/master_csv/**',
      '_data/derived/**',
      // 表示用ランキングは本番ではR2から取得する。関数へ同梱すると1GB超になる。
      './public/data/rankings/**/*',
    ],
  },
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
  async headers() {
    return [
      {
        source: '/data/top-leaders/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/data/rankings/weekly/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, stale-while-revalidate=3600',
          },
        ],
      },
    ]
  },
  // Node 24 + OneDrive 等で WasmHash._updateWithBuffer が undefined で落ちる事例の回避
  // （webpack の wasm-md4 経路を使わず xxhash64 に固定）
  webpack: (config) => {
    if (config.output && typeof config.output === 'object') {
      config.output.hashFunction = 'xxhash64'
    }
    return config
  },
}

export default nextConfig
