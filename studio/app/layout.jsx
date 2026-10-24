import './globals.css';

export const metadata = {
  title: 'VaaniBoard Studio',
  description: 'Offline caregiver app for the VaaniBoard AAC board',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
