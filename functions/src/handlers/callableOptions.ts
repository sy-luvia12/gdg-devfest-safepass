// Read from functions/.env.<project> at load. A defineBoolean param would not work here: the SDK calls .value() on
// enforceAppCheck while the functions are being discovered, which prompts for a value and warns. Off unless the
// env file says ENFORCE_APP_CHECK=true, so existing clients keep working.
export const callableOptions = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
