/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // Keep production builds from overwriting the active dev server cache.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
};
export default nextConfig;
