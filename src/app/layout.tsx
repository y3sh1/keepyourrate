import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KeepYourRate — A fair way to say yes',
  description: 'Turn extra requests into a paid add-on or a swap within budget.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
