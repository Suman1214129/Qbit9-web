import type { Metadata } from "next";
import { BookScreen } from "@/features/booking/book-screen";

export const metadata: Metadata = { title: "Book a visit" };

export default function Page() {
  return <BookScreen />;
}
