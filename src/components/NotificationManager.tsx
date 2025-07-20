import React from 'react';
import Notification, { NotificationProps } from './Notification';

interface NotificationManagerProps {
  notifications: NotificationProps[];
  onClose: (id: string) => void;
}

export default function NotificationManager({ notifications, onClose }: NotificationManagerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {notifications.slice(0, 5).map((notification, index) => (
        <div
          key={notification.id}
          className="pointer-events-auto"
          style={{
            transform: `translateY(${index * 4}px) scale(${1 - index * 0.02})`,
            opacity: 1 - index * 0.05,
            zIndex: 50 - index,
            transition: 'all 0.3s ease-out'
          }}
        >
          <Notification {...notification} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}