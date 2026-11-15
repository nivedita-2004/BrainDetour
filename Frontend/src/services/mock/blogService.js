/**
 * Mock Blog Service Interface
 * 
 * Provides access to editorial articles and essays.
 * Designed to be replaced with a live headless CMS or REST/GraphQL endpoint.
 */

import { MOCK_BLOG_POSTS } from '../../data/mock/blogPosts.js'

let cachedPosts = [...MOCK_BLOG_POSTS]

export const mockBlogService = {
  /**
   * Synchronously returns available cached blog posts to prevent route transition flashes.
   * @returns {Array<typeof MOCK_BLOG_POSTS[0]>}
   */
  getCachedBlogPosts() {
    return cachedPosts
  },

  /**
   * Synchronously returns a cached blog post by slug if available.
   * @param {string} slug
   * @returns {typeof MOCK_BLOG_POSTS[0] | null}
   */
  getCachedBlogPostBySlug(slug) {
    if (!slug) return null
    return cachedPosts.find((p) => p.slug === slug) || null
  },

  /**
   * Retrieves all published blog posts.
   * @returns {Promise<Array<typeof MOCK_BLOG_POSTS[0]>>}
   */
  async getBlogPosts() {
    cachedPosts = [...MOCK_BLOG_POSTS]
    return cachedPosts
  },

  /**
   * Retrieves a single blog post by its URL slug.
   * @param {string} slug
   * @returns {Promise<typeof MOCK_BLOG_POSTS[0] | null>}
   */
  async getBlogPostBySlug(slug) {
    const post = cachedPosts.find((p) => p.slug === slug)
    return post || null
  },
}
