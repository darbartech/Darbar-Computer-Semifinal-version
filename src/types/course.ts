export type CourseLevel =
  | "Beginner"
  | "Intermediate"
  | "Advanced"
  | "Beginner to Intermediate";

export interface Course {
  id: string;
  slug: string;
  title: string;
  category: string;
  tagline: string;
  level: CourseLevel;
  duration: string;
  learningMode: string;
  newBatch: string;
  timing: string;
  instituteCertificate: string;
  industryCertification?: string;
  internship?: string;
  targetStudents: string;
  shortDescription: string;
  skillsGained: string[];
  softwareTools: string[];
  portfolioProjects: string[];
  careerOpportunities: string[];
  image: string;
  featured?: boolean;
  feeNPR?: number;
  feeNote?: string;
  seats?: string;
  seoTitle?: string;
  seoDescription?: string;
  overview?: string;
  learningObjectives?: string[];
  prerequisites?: string;
  cta?: string;
}
