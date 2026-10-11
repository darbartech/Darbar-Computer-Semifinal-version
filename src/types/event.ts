export interface EventItem {
  id: string;
  slug: string;
  title: string;
  date: string;
  time: string;
  location: string;
  shortDescription: string;
  fullDescription: string;
  image: string;
  category: "Workshop" | "Seminar" | "Open House" | "Certification" | "Other";
  upcoming: boolean;
}
