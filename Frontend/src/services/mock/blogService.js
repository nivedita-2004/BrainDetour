/**
 * Mock Blog Service Interface
 * 
 * Provides access to editorial articles and essays.
 * Designed to be replaced with a live headless CMS or REST/GraphQL endpoint.
 */

import { MOCK_BLOG_POSTS } from '../../data/mock/blogPosts'

export const mockBlogService = {
  /**
   * Retrieves all published blog posts.
   * @returns {Promise<Array<typeof MOCK_BLOG_POSTS[0]>>}
   */
  async getBlogPosts() {
    await new Promise((resolve) => setTimeout(resolve, 200))
    return [...MOCK_BLOG_POSTS]
  },

  /**
   * Retrieves a single blog post by its URL slug.
   * @param {string} slug
   * @returns {Promise<typeof MOCK_BLOG_POSTS[0] | null>}
   */
  async getBlogPostBySlug(slug) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    const post = MOCK_BLOG_POSTS.find((p) => p.slug === slug)
    return post || null
  },
}
