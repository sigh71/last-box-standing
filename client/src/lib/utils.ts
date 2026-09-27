import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Whether the primary pointer is a mouse or trackpad. Search fields use it to
 * skip autofocus on phones: focusing opens the on-screen keyboard, which on iOS
 * covers the results the dialog is about to show.
 */
export function hasFinePointer() {
  return window.matchMedia("(pointer: fine)").matches;
}
