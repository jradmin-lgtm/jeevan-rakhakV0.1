import React from "react";
import { HospitalLoginForm } from "./HospitalLoginForm";
import { LoginAmbience, GetAppPanel } from "../login-extras";

export default function HospitalLoginPage() {
  return (
    <>
      <LoginAmbience />
      <HospitalLoginForm />
      <GetAppPanel />
    </>
  );
}
