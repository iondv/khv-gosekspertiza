class EgrzApiError extends Error {
  /**
   * @param {String} message
   * @param {String|Number} [statusCode]
   */
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'EgrzApiError';
  }
}

module.exports = EgrzApiError;
