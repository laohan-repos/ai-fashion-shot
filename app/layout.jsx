import './globals.css';
import './brand.css';

export const metadata = {
  title: '穿影 · AI 服装视频工作台',
  description: '穿影 AI 服装图片与视频创作工作台',
  icons: { icon: '/chuanying-logo.png' },
};

export default function RootLayout({ children }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
