/**
 * Standard API Response Helper
 * All responses use HTTP 200 with response_code inside body
 */

const sendSuccess = (res, data = null, message = "Success", code = "200") => {
  return res.status(200).json({
    response: {
      response_code: code,
      response_message: message,
    },
    data: data,
  });
};

const sendError = (res, message = "Something went wrong", code = "400", data = null) => {
  return res.status(200).json({
    response: {
      response_code: code,
      response_message: message,
    },
    data: data,
  });
};

module.exports = { sendSuccess, sendError };
