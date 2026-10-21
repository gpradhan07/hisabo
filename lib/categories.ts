import {
  Baby,
  Bike,
  BookOpen,
  Car,
  Clapperboard,
  Coffee,
  CreditCard,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Pill,
  PawPrint,
  Plane,
  Receipt,
  Repeat,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Tag,
  Trophy,
  UtensilsCrossed,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * The categories your iOS Shortcut offers, in the same order. "Add expense" shows exactly these
 * (as pills and in the dropdown), so manual entries match the Shortcut's.
 */
export const EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Shopping",
  "Quick Delivery",
  "Rent",
  "Mobile & Internet",
  "Transport",
  "Entertainment",
  "Subscriptions",
  "Home & Maintenance",
  "Health & Medical",
  "Gifts & Donations",
  "Sports",
  "Miscellaneous",
];

/** Whole-word keyword → icon. First match wins, so specific rules come before generic ones. */
const RULES: [RegExp, LucideIcon][] = [
  [/\b(quick delivery|deliver(y|ies)|instamart|dunzo)\b/i, Bike],
  [/\b(coffee|cafe|chai|tea|starbucks)\b/i, Coffee],
  [/\b(food|dining|restaurants?|lunch|dinner|breakfast|snacks?|swiggy|zomato|eat(ing)?|meals?)\b/i, UtensilsCrossed],
  [/\b(grocer(y|ies)|vegetables?|fruits?|kirana|supermarket|blinkit|bigbasket|zepto|dmart)\b/i, ShoppingBasket],
  [/\b(loans?|emis?|credit|card|cc)\b/i, CreditCard],
  [/\b(fuel|petrol|diesel|cng)\b/i, Fuel],
  [/\b(flights?|travel|trips?|holidays?|vacation|hotels?)\b/i, Plane],
  [/\b(transport|cabs?|taxi|uber|ola|rapido|auto|metro|bus|train|commute|car|parking|toll)\b/i, Car],
  [/\b(maintenance|repairs?|plumber|electrician)\b/i, Wrench],
  [/\b(rent|house|home|housing)\b/i, House],
  [/\b(electric(ity)?|power|utilit(y|ies))\b/i, Zap],
  [/\b(phone|mobile|recharge)\b/i, Smartphone],
  [/\b(internet|wifi|wi-fi|broadband)\b/i, Wifi],
  [/\b(subscriptions?|netflix|spotify|prime|ott)\b/i, Repeat],
  [/\b(bills?)\b/i, Receipt],
  [/\b(health|doctor|hospital|clinic)\b/i, HeartPulse],
  [/\b(medical|medicines?|pharmacy|pills?)\b/i, Pill],
  [/\b(sports?|cricket|football|badminton|tennis)\b/i, Trophy],
  [/\b(gym|fitness|yoga)\b/i, Dumbbell],
  [/\b(clothes|clothing|apparel|fashion)\b/i, Shirt],
  [/\b(shopping|shop|amazon|flipkart|myntra)\b/i, ShoppingBag],
  [/\b(movies?|entertainment|netflix|ott|games?|fun|party|outing)\b/i, Clapperboard],
  [/\b(education|school|college|courses?|tuition|fees)\b/i, GraduationCap],
  [/\b(books?)\b/i, BookOpen],
  [/\b(gifts?|donations?|charity)\b/i, Gift],
  [/\b(insurance)\b/i, Shield],
  [/\b(service)\b/i, Wrench],
  [/\b(pets?|dogs?|cats?)\b/i, PawPrint],
  [/\b(kids?|baby|child(ren)?)\b/i, Baby],
];

const cache = new Map<string, LucideIcon>();

export function categoryIcon(category: string): LucideIcon {
  let icon = cache.get(category);
  if (!icon) {
    icon = RULES.find(([re]) => re.test(category))?.[1] ?? Tag;
    cache.set(category, icon);
  }
  return icon;
}
