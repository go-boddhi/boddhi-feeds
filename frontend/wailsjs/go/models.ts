export namespace db {
	
	export class DownloadItem {
	    id: number;
	    item_id?: number;
	    url: string;
	    title: string;
	    thumbnail: string;
	    status: string;
	    progress: number;
	    speed: string;
	    eta: string;
	    file_path: string;
	    error_msg: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.item_id = source["item_id"];
	        this.url = source["url"];
	        this.title = source["title"];
	        this.thumbnail = source["thumbnail"];
	        this.status = source["status"];
	        this.progress = source["progress"];
	        this.speed = source["speed"];
	        this.eta = source["eta"];
	        this.file_path = source["file_path"];
	        this.error_msg = source["error_msg"];
	        this.created_at = source["created_at"];
	    }
	}
	export class Feed {
	    id: number;
	    title: string;
	    feed_url: string;
	    site_url: string;
	    feed_type: string;
	    category: string;
	    icon_url: string;
	    scope: string;
	    last_updated: string;
	    created_at: string;
	    unread_count: number;
	
	    static createFrom(source: any = {}) {
	        return new Feed(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.feed_url = source["feed_url"];
	        this.site_url = source["site_url"];
	        this.feed_type = source["feed_type"];
	        this.category = source["category"];
	        this.icon_url = source["icon_url"];
	        this.scope = source["scope"];
	        this.last_updated = source["last_updated"];
	        this.created_at = source["created_at"];
	        this.unread_count = source["unread_count"];
	    }
	}
	export class FilterRule {
	    id: number;
	    keyword: string;
	    action: string;
	    target_field: string;
	
	    static createFrom(source: any = {}) {
	        return new FilterRule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.keyword = source["keyword"];
	        this.action = source["action"];
	        this.target_field = source["target_field"];
	    }
	}
	export class GardenNote {
	    id: number;
	    item_id: number;
	    item_title: string;
	    item_link: string;
	    feed_title: string;
	    note_markdown: string;
	    tags: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new GardenNote(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.item_id = source["item_id"];
	        this.item_title = source["item_title"];
	        this.item_link = source["item_link"];
	        this.feed_title = source["feed_title"];
	        this.note_markdown = source["note_markdown"];
	        this.tags = source["tags"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class Item {
	    id: number;
	    feed_id: number;
	    feed_title: string;
	    feed_type: string;
	    category: string;
	    guid: string;
	    title: string;
	    content: string;
	    snippet: string;
	    link: string;
	    author: string;
	    pub_date: string;
	    thumbnail: string;
	    is_read: boolean;
	    is_bookmarked: boolean;
	    noise_score: number;
	    has_note: boolean;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Item(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.feed_id = source["feed_id"];
	        this.feed_title = source["feed_title"];
	        this.feed_type = source["feed_type"];
	        this.category = source["category"];
	        this.guid = source["guid"];
	        this.title = source["title"];
	        this.content = source["content"];
	        this.snippet = source["snippet"];
	        this.link = source["link"];
	        this.author = source["author"];
	        this.pub_date = source["pub_date"];
	        this.thumbnail = source["thumbnail"];
	        this.is_read = source["is_read"];
	        this.is_bookmarked = source["is_bookmarked"];
	        this.noise_score = source["noise_score"];
	        this.has_note = source["has_note"];
	        this.created_at = source["created_at"];
	    }
	}
	export class QueueItem {
	    id: number;
	    item_id?: number;
	    url: string;
	    title: string;
	    thumbnail: string;
	    content_type: string;
	    description: string;
	    status: string;
	    position: number;
	    added_at: string;
	
	    static createFrom(source: any = {}) {
	        return new QueueItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.item_id = source["item_id"];
	        this.url = source["url"];
	        this.title = source["title"];
	        this.thumbnail = source["thumbnail"];
	        this.content_type = source["content_type"];
	        this.description = source["description"];
	        this.status = source["status"];
	        this.position = source["position"];
	        this.added_at = source["added_at"];
	    }
	}

}

export namespace main {
	
	export class PDFResult {
	    data: string;
	    file_name: string;
	
	    static createFrom(source: any = {}) {
	        return new PDFResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.data = source["data"];
	        this.file_name = source["file_name"];
	    }
	}
	export class VoiceInfo {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new VoiceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}

}

