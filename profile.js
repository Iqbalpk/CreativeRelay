// Photos belong in private Storage, never in auth metadata/JWT claims.
export class ProfilePhotos {
  constructor(client, urls = URL) { this.client = client; this.urls = urls; this.reset(); }
  reset() {
    if (this.url) this.urls.revokeObjectURL(this.url);
    this.url = ''; this.userId = ''; this.pending = null; this.version = (this.version || 0) + 1;
  }
  async load(userId) {
    if (this.userId === userId && this.pending) return this.pending;
    this.reset(); this.userId = userId;
    const version = this.version;
    this.pending = (async () => {
      const {data, error} = await this.client.storage.from('assets').download(`${userId}/profile/avatar.jpg`);
      if (version !== this.version || error || !data) return '';
      this.url = this.urls.createObjectURL(data);
      return this.url;
    })().catch(() => '');
    return this.pending;
  }
  async save(userId, blob) {
    const {error} = await this.client.storage.from('assets').upload(`${userId}/profile/avatar.jpg`, blob, {contentType: 'image/jpeg', upsert: true});
    if (error) throw error;
    this.reset();
    return this.load(userId);
  }
}
