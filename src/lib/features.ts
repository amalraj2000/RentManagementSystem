/**
 * Rooms are fixed at 2 bedrooms with 4 beds each, so adding / deleting rooms and changing the number of beds is switched OFF.
 * The code is all still here: set this to true to bring "Add room", "Delete room" and "Number of beds" back.
 */
export const ROOM_ADD_DELETE_ENABLED = false;

/** The PG holds at most this many ACTIVE tenants (not vacated). At the limit, no new tenant can be added and a vacate cannot be undone. */
export const MAX_ACTIVE_TENANTS = 8;
