// [PLACEHOLDER GALLERY - replace with real Darbar Computer photos + written consent before launch]

export const GALLERY_CATEGORIES = [
  "All",
  "Campus",
  "Labs",
  "Events",
  "Classes",
  "Certifications",
] as const;

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

export interface GalleryImage {
  id: string;
  src: string;
  alt: string;
  title?: string;
  date?: string;
  category: Exclude<GalleryCategory, "All">;
  isPlaceholder?: boolean;
}

const galleryPool: Record<string, string[]> = {
  Campus: [
    "https://images.pexels.com/photos/10127241/pexels-photo-10127241.jpeg?auto=compress&cs=tinysrgb&w=1400",
    "https://images.pexels.com/photos/10638115/pexels-photo-10638115.jpeg?auto=compress&cs=tinysrgb&w=1400",
  ],
  Labs: [
    "https://images.pexels.com/photos/18471480/pexels-photo-18471480.jpeg?auto=compress&cs=tinysrgb&w=1400",
    "https://images.pexels.com/photos/3862632/pexels-photo-3862632.jpeg?auto=compress&cs=tinysrgb&w=1400",
    "https://images.pexels.com/photos/442154/pexels-photo-442154.jpeg?auto=compress&cs=tinysrgb&w=1400",
  ],
  Classes: [
    "https://images.pexels.com/photos/10638075/pexels-photo-10638075.jpeg?auto=compress&cs=tinysrgb&w=1400",
    "https://images.pexels.com/photos/10643463/pexels-photo-10643463.jpeg?auto=compress&cs=tinysrgb&w=1400",
    "https://images.pexels.com/photos/4348404/pexels-photo-4348404.jpeg?auto=compress&cs=tinysrgb&w=1400",
  ],
  Events: [
    "https://images.pexels.com/photos/17258012/pexels-photo-17258012.jpeg?auto=compress&cs=tinysrgb&w=1400",
    "https://images.pexels.com/photos/5539293/pexels-photo-5539293.jpeg?auto=compress&cs=tinysrgb&w=1400",
    "https://images.pexels.com/photos/5940841/pexels-photo-5940841.jpeg?auto=compress&cs=tinysrgb&w=1400",
  ],
  Certifications: [
    "https://images.pexels.com/photos/5940839/pexels-photo-5940839.jpeg?auto=compress&cs=tinysrgb&w=1400",
    "https://images.pexels.com/photos/143133/pexels-photo-143133.jpeg?auto=compress&cs=tinysrgb&w=1400",
  ],
};

const galTitles: Record<string, string[]> = {
  Campus: [
    "Main Campus Entrance",
    "Reception & Student Lounge",
  ],
  Labs: [
    "Web Development Lab",
    "Computer Lab Group Session",
    "Hardware & Networking Lab",
  ],
  Classes: [
    "Basic Computer Class",
    "Classroom in Session",
    "Graphic Design Workshop",
  ],
  Events: [
    "Graduation Ceremony",
    "Open House Day",
    "Guest Speaker Session",
  ],
  Certifications: [
    "Certification Award",
    "Graduation Group",
  ],
};

const galAlts: Record<string, string[]> = {
  Campus: [
    "DarbarTech main campus building entrance",
    "Student lounge and reception area",
  ],
  Labs: [
    "Modern computer lab with students practicing",
    "Students collaborating at computer lab",
    "Hardware and networking lab equipment",
  ],
  Classes: [
    "Computer basics classroom in progress",
    "Trainer teaching students in a classroom",
    "Graphic design students working on projects",
  ],
  Events: [
    "Students receiving certificates on stage",
    "Open house event attendees exploring labs",
    "Seminar audience listening to speaker",
  ],
  Certifications: [
    "Graduation moment — certificate presentation",
    "Group photo of graduating batch with certificates",
  ],
};

export const galleryImages: GalleryImage[] = [
  {
    id: "g1",
    src: galleryPool.Campus[0],
    alt: galAlts.Campus[0],
    title: galTitles.Campus[0],
    date: "2026-01-15",
    category: "Campus",
  },
  {
    id: "g2",
    src: galleryPool.Labs[0],
    alt: galAlts.Labs[0],
    title: galTitles.Labs[0],
    date: "2026-02-10",
    category: "Labs",
  },
  {
    id: "g3",
    src: galleryPool.Labs[2],
    alt: galAlts.Labs[2],
    title: galTitles.Labs[2],
    date: "2026-02-15",
    category: "Labs",
  },
  {
    id: "g4",
    src: galleryPool.Classes[1],
    alt: galAlts.Classes[1],
    title: "Programming Class in Session",
    date: "2026-03-05",
    category: "Classes",
  },
  {
    id: "g5",
    src: galleryPool.Classes[2],
    alt: galAlts.Classes[2],
    title: galTitles.Classes[2],
    date: "2026-03-12",
    category: "Classes",
  },
  {
    id: "g6",
    src: galleryPool.Events[1],
    alt: galAlts.Events[1],
    title: "Open House Day — Jan 2026",
    date: "2026-01-25",
    category: "Events",
  },
  {
    id: "g7",
    src: galleryPool.Events[2],
    alt: "Students at front of room presenting final project",
    title: "Full-Stack Demo Workshop",
    date: "2026-02-22",
    category: "Events",
  },
  {
    id: "g8",
    src: galleryPool.Classes[0],
    alt: galAlts.Events[2],
    title: "Python Automation Seminar",
    date: "2026-03-05",
    category: "Events",
  },
  {
    id: "g9",
    src: galleryPool.Certifications[0],
    alt: galAlts.Certifications[0],
    title: "Batch 23 Certification Ceremony",
    date: "2026-04-10",
    category: "Certifications",
  },
  {
    id: "g10",
    src: galleryPool.Certifications[1],
    alt: galAlts.Certifications[1],
    title: "Batch 24 Graduation Group Photo",
    date: "2026-07-10",
    category: "Certifications",
  },
  {
    id: "g11",
    src: galleryPool.Campus[1],
    alt: galAlts.Campus[1],
    title: galTitles.Campus[1],
    date: "2026-01-20",
    category: "Campus",
  },
  {
    id: "g12",
    src: galleryPool.Labs[1],
    alt: galAlts.Labs[1],
    title: "Accounting & Tally Lab",
    date: "2026-02-28",
    category: "Labs",
  },
];

export function getImagesByCategory(category: GalleryCategory): GalleryImage[] {
  if (category === "All") return galleryImages;
  return galleryImages.filter((g) => g.category === category);
}
