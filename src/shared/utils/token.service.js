import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../../config/env.js';

export class TokenService {
  /**
   * Generates a signed JWT token
   * @param {Object} payload 
   * @param {Object} options
   * @returns {string}
   */
  static generateToken(payload, options = {}) {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: options.expiresIn || config.jwt.expiresIn,
    });
  }

  /**
   * Generates a short-lived access token
   * @param {Object} payload 
   * @param {Object} options
   * @returns {string}
   */
  static generateAccessToken(payload, options = {}) {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: options.expiresIn || config.jwt.accessExpiresIn || '1h',
    });
  }

  /**
   * Generates a random refresh token
   * @returns {string}
   */
  static generateRefreshToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verifies and decodes a JWT token
   * @param {string} token 
   * @returns {Object}
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (err) {
      return null;
    }
  }
}

