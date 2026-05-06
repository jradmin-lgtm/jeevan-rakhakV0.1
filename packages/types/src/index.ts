export type EmergencyType =
  | "ACCIDENT_TRAUMA"
  | "CARDIAC"
  | "BREATHING_DISTRESS"
  | "PREGNANCY_NEONATAL"
  | "GENERAL_CRITICAL_TRANSFER";

export type BookingStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "ARRIVED"
  | "PICKED_UP"
  | "COMPLETED"
  | "CANCELLED";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface BookingDTO {
  id: string;
  userId: string;
  driverId?: string;
  status: BookingStatus;
  emergencyType: EmergencyType;
  pickup: GeoPoint;
  drop: GeoPoint;
}
