import { motion } from "framer-motion";
import { clsx } from 'clsx';

interface ScoreRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ScoreRing({ score, size = 'md', className }: ScoreRingProps) {
  const radius = size === 'lg' ? 40 : size === 'md' ? 24 : 16;
  const stroke = size === 'lg' ? 6 : size === 'md' ? 4 : 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let colorClass = 'text-red-500';
  if (score >= 80) colorClass = 'text-emerald-500';
  else if (score >= 60) colorClass = 'text-amber-500';

  let bgClass = 'text-red-100';
  if (score >= 80) bgClass = 'text-emerald-100';
  else if (score >= 60) bgClass = 'text-amber-100';

  const sizeClass = size === 'lg' ? 'h-24 w-24' : size === 'md' ? 'h-14 w-14' : 'h-10 w-10';
  const textClass = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <div className={clsx('relative flex items-center justify-center', sizeClass, className)}>
      <svg
        height={radius * 2}
        width={radius * 2}
        className="rotate-[-90deg] transition-all duration-500"
      >
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className={clsx(bgClass)}
        />
        <motion.circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className={clsx(colorClass)}
          strokeLinecap="round"
        />
      </svg>
      <div className={clsx('absolute font-bold text-slate-700', textClass)}>
        {score}
      </div>
    </div>
  );
}
