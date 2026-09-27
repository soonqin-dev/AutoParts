import "./globals.css";

export const metadata = {
  title: "AutoParts Catalog",
  description: "汽车零件资料查询工具"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
