// Static export: `npm run build` writes plain HTML/JS to out/, so the app runs
// from a laptop with no internet and no server-side code.
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
};

export default nextConfig;
