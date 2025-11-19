import { useEffect, useState } from 'react';
import type { TemplateItem } from '@/schemas';

interface CustomDragOverlayProps {
  activeItem: TemplateItem | null;
}

export function CustomDragOverlay({ activeItem }: CustomDragOverlayProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!activeItem) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    // Start tracking immediately
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [activeItem]);

  if (!activeItem) return null;

  return (
    <div
      className="fixed pointer-events-none z-[9999]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="bg-white border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
        <span className="font-medium">{activeItem.name}</span>
      </div>
    </div>
  );
}
