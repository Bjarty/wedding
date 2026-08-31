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

export type ScheduleIcon = 'clock' | 'heart' | 'cake' | 'utensils' | 'users' | 'music';

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  location: string;
  description: string;
  icon: ScheduleIcon;
}

export type TravelIcon = 'car' | 'parking' | 'bed' | 'taxi';

export interface TravelOption {
  id: string;
  title: string;
  description: string;
  icon: TravelIcon;
}

export interface DressCodeColor {
  id: string;
  label: string;
  color: `#${string}`;
  foreground: 'light' | 'dark';
}

export interface DressCodeInspiration {
  id: string;
  image: `/images/${string}`;
  alt: string;
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

export interface GiftContribution {
  id: string;
  title: string;
  location: string;
  description: string;
  ctaLabel: string;
  amountLabel?: string;
  recipientLabel?: string;
  paymentHref?: `https://${string}`;
}

export interface PaymentProvider {
  name: string;
  origin: `https://${string}`;
  paymentPathPrefix: `/${string}`;
  privacyHref: `https://${string}`;
}

export interface SiteContent {
  metadata: {
    language: string;
    title: string;
  };
  event: {
    couple: {
      firstName: string;
      secondName: string;
      displayName: string;
      monogram: string;
    };
    date: {
      iso: `${number}-${number}-${number}`;
      display: string;
    };
    timeZone: string;
    place: string;
    venue: {
      roomName: string;
      organisationName: string;
      address: string;
      mapsUrl: string;
    };
    rsvpDeadline: {
      iso: `${number}-${number}-${number}`;
      display: string;
    };
  };
  contacts: {
    generalEmail: string;
    rsvpEmail: string;
    giftsEmail: string;
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
    enabled: boolean;
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
  dressCode: {
    sectionId: string;
    eyebrow: string;
    heading: string;
    introduction: string;
    inspirationLabel: string;
    inspiration: DressCodeInspiration[];
    colorsLabel: string;
    colors: DressCodeColor[];
    printNote: string;
  };
  location: {
    sectionId: string;
    venueName: string;
    venueContext: string;
    address: string;
    mapHref: string;
    mapLabel: string;
    heading: string;
    introduction: string;
    travelOptions: TravelOption[];
  };
  honeymoon: {
    enabled: boolean;
    sectionId: string;
    eyebrow: string;
    headingLineOne: string;
    headingLineTwo: string;
    quote: string;
    startDate: string;
    stops: HoneymoonStop[];
  };
  gifts: {
    enabled: boolean;
    sectionId: string;
    eyebrow: string;
    heading: string;
    introduction: string[];
    routeHeading: string;
    travelDates: string;
    route: string[];
    contributionsEyebrow: string;
    contributionsHeading: string;
    contributions: GiftContribution[];
    paymentLinksEnabled: boolean;
    paymentProvider: PaymentProvider | null;
    paymentUnavailableLabel: string;
    externalPaymentNote: string;
    thanksHeading: string;
    thanksText: string[];
    signature: string;
  };
  rsvp: {
    sectionId: string;
    headingPrefix: string;
    headingEmphasis: string;
    deadline: string;
    statusHeading: string;
    statusMessage: string;
    contactLabel: string;
    codeEntry: {
      eyebrow: string;
      heading: string;
      introduction: string;
      label: string;
      helper: string;
      invalidFormat: string;
      submitLabel: string;
      switchLabel: string;
    };
    form: {
      invitationHeading: string;
      dayVariantLabel: string;
      dayArrivalMessage: string;
      eveningVariantLabel: string;
      eveningArrivalMessage: string;
      wrongNamesMessage: string;
      attendanceQuestionPrefix: string;
      attendanceYesLabel: string;
      attendanceNoLabel: string;
      mealQuestionPrefix: string;
      mealChoices: {
        fish: string;
        meat: string;
        vegetarian: string;
        vegan: string;
      };
      emailLabel: string;
      emailHelper: string;
      emailConfirmationEnabledNote: string;
      emailConfirmationDisabledNote: string;
      emailConfirmationDemoNote: string;
      messageLabel: string;
      messageHelper: string;
      submitLabel: string;
      updateLabel: string;
      privacyHeading: string;
      privacyMessage: string;
      privacyEmailDisabledMessage: string;
      demoPrivacyMessage: string;
    };
    states: {
      loading: string;
      invalidLink: string;
      invalidCode: string;
      loadError: string;
      offline: string;
      submitting: string;
      validationError: string;
      submitError: string;
      conflict: string;
      rateLimited: string;
      closed: string;
      success: string;
      receiptLabel: string;
      receiptAccessHelper: string;
      receiptEmailEnabledHelper: string;
      receiptEmailEmptyHelper: string;
      receiptEmailDisabledHelper: string;
      demoReceiptHelper: string;
      retryLabel: string;
      loadLatestLabel: string;
    };
  };
  footer: {
    coupleLabel: string;
    contactLabel: string;
    copyright: string;
    credit: string;
    links: Array<{ id: string; label: string; href: string }>;
  };
}
