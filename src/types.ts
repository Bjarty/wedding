export interface NavItem {
  id: string;
  label: string;
  href: `#${string}`;
}

export interface StoryItem {
  id: string;
  year: string;
  title: string;
  text: string;
  image: string;
}

export type ScheduleIcon = 'sparkles' | 'utensils' | 'music';

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  location: string;
  description: string;
  icon: ScheduleIcon;
}

export type TravelIcon = 'plane' | 'train' | 'car' | 'map';

export interface TravelOption {
  id: string;
  title: string;
  description: string;
  icon: TravelIcon;
  variant: 'default' | 'maps';
}

export type HoneymoonIcon = 'sun' | 'wind' | 'camera' | 'map-pin';

export interface HoneymoonStop {
  id: string;
  day: number;
  location: string;
  title: string;
  description: string;
  image: string;
  icon: HoneymoonIcon;
}

export interface SiteContent {
  metadata: {
    language: string;
    title: string;
  };
  navigation: {
    monogram: string;
    items: NavItem[];
    ctaLabel: string;
    ctaHref: `#${string}`;
  };
  hero: {
    eyebrow: string;
    firstName: string;
    secondName: string;
    dateLine: string;
    scrollLabel: string;
  };
  story: {
    sectionId: string;
    heading: string;
    introduction: string;
    items: StoryItem[];
    endingHeading: string;
    endingText: string;
  };
  schedule: {
    sectionId: string;
    heading: string;
    dateLine: string;
    events: ScheduleItem[];
  };
  location: {
    sectionId: string;
    image: string;
    imageAlt: string;
    venueName: string;
    address: string;
    heading: string;
    introduction: string;
    travelOptions: TravelOption[];
  };
  honeymoon: {
    sectionId: string;
    eyebrow: string;
    headingLineOne: string;
    headingLineTwo: string;
    quote: string;
    startDate: string;
    stops: HoneymoonStop[];
  };
  rsvp: {
    sectionId: string;
    headingPrefix: string;
    headingEmphasis: string;
    deadline: string;
    nameLabel: string;
    namePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    attendanceLabel: string;
    attendance: {
      yes: { value: 'yes'; label: string };
      no: { value: 'no'; label: string };
    };
    guestsLabel: string;
    messageLabel: string;
    messagePlaceholder: string;
    submitLabel: string;
    successHeading: string;
    successMessage: string;
    resetLabel: string;
  };
  footer: {
    coupleLabel: string;
    socialHref: string;
    socialLabel: string;
    contactHref: `mailto:${string}`;
    contactLabel: string;
    copyright: string;
    credit: string;
    links: Array<{ id: string; label: string; href: string }>;
  };
}
