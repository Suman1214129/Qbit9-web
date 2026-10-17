/**
 * Set while the customer is deliberately signing out or deleting their data, so the auth gate does not
 * bounce them to "sign in and come back here" before the redirect to the start page lands.
 */
let leaving = false;
export const markLeaving = () => { leaving = true; };
export const clearLeaving = () => { leaving = false; };
export const isLeaving = () => leaving;
