import { format, parseISO } from "date-fns";

export const formatCertificateDate = (
  dateStr: string,
  formatType: "full" | "short" | "numeric" = "full"
): string => {
  try {
    const date = parseISO(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    switch (formatType) {
      case "short":
        return format(date, "dd MMM yyyy").toUpperCase();
      case "numeric":
        return format(date, "yyyy-MM-dd");
      case "full":
      default:
        return format(date, "dd MMMM yyyy").toUpperCase();
    }
  } catch {
    return dateStr;
  }
};

export const getCurrentDateStr = (): string => {
  return format(new Date(), "yyyy-MM-dd");
};

export const formatDateForDisplay = (date: Date | string | undefined, fmt: string = "PPP"): string => {
  if (!date) return "-";
  const d = typeof date === "string" ? parseISO(date) : date;
  try {
    return format(d, fmt);
  } catch {
    return String(date);
  }
};
