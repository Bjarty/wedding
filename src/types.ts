export interface NavItem {
  id: string;
  label: string;
  href: string;
}

export interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  image?: string;
}

export interface ScheduleItem {
  time: string;
  activity: string;
  location: string;
  description?: string;
}

export interface HoneymoonStop {
  id: string;
  day: number;
  location: string;
  image: string;
  description: string;
  coordinates: { lat: number; lng: number };
}
