/**
 * Booking status vocabulary, shared so both frontends describe a booking the
 * same way. `tone` maps to a badge colour.
 */
export const BOOKING_STATUS = {
  PENDING_REVIEW: {
    label: "Awaiting review",
    tone: "warning",
    customer: "We are reviewing your request",
  },
  APPROVED: {
    label: "Awaiting payment",
    tone: "info",
    customer: "Approved — payment needed to confirm",
  },
  CONFIRMED: {
    label: "Confirmed",
    tone: "success",
    customer: "Confirmed and ready for collection",
  },
  PICKED_UP: {
    label: "On hire",
    tone: "accent",
    customer: "Collected — enjoy your event",
  },
  OVERDUE: {
    label: "Overdue",
    tone: "danger",
    customer: "Return is overdue — please contact us",
  },
  RETURNED: {
    label: "Returned",
    tone: "neutral",
    customer: "Returned — inspection in progress",
  },
  COMPLETED: { label: "Completed", tone: "neutral", customer: "Completed" },
  REJECTED: {
    label: "Declined",
    tone: "danger",
    customer: "We could not accept this request",
  },
  EXPIRED: {
    label: "Expired",
    tone: "neutral",
    customer: "Expired — payment was not received in time",
  },
  CANCELLED: { label: "Cancelled", tone: "neutral", customer: "Cancelled" },
};

export const statusLabel = (s) => BOOKING_STATUS[s]?.label ?? s;
export const statusTone = (s) => BOOKING_STATUS[s]?.tone ?? "neutral";

export const CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "UNSERVICEABLE"];
export const UNIT_STATUSES = [
  "AVAILABLE",
  "ON_HIRE",
  "MAINTENANCE",
  "DAMAGED",
  "LOST",
  "RETIRED",
];

export const titleCase = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
