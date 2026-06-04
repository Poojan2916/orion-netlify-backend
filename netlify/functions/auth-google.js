"use strict";

const g = require("./_google");

exports.handler = async (event) => {
  const options = g.handleOptions(event);
  if (options) return options;

  try {
    return {
      statusCode: 302,
      headers: {
        ...g.corsHeaders(),
        Location: g.authUrl(),
      },
      body: "",
    };
  } catch (e) {
    console.error(e);
    return g.json(500, { error: e.message });
  }
};
