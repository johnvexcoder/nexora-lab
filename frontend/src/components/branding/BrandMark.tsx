import { cn } from '@/lib/utils';

type BrandMarkProps = {
  variant?: 'core' | 'detailed';
  className?: string;
  alt?: string;
};

const SOURCES = {
  core: {
    webp: '/branding/nexora-core-80.webp 80w, /branding/nexora-core-160.webp 160w',
    png: '/branding/nexora-core-80.png 80w, /branding/nexora-core-160.png 160w',
    fallback: '/branding/nexora-core-80.png',
    sizes: '40px',
    width: 80,
    height: 80,
  },
  detailed: {
    webp: '/branding/nexora-detailed-160.webp 160w, /branding/nexora-detailed-320.webp 320w',
    png: '/branding/nexora-detailed-160.png 160w, /branding/nexora-detailed-320.png 320w',
    fallback: '/branding/nexora-detailed-160.png',
    sizes: '80px',
    width: 160,
    height: 146,
  },
} as const;

export function BrandMark({ variant = 'core', className, alt = 'Nexora Lab' }: BrandMarkProps) {
  const source = SOURCES[variant];

  return (
    <picture className="block shrink-0">
      <source type="image/webp" srcSet={source.webp} sizes={source.sizes} />
      <img
        src={source.fallback}
        srcSet={source.png}
        sizes={source.sizes}
        width={source.width}
        height={source.height}
        alt={alt}
        decoding="async"
        className={cn('block object-contain', className)}
      />
    </picture>
  );
}
