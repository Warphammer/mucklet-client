import { Model } from 'modapp-resource';
import TokenList from 'classes/TokenList';
import objectKeyDiff from 'utils/objectKeyDiff';
import {
	keyTokenRegex,
	keyExpandRegex,
} from 'utils/regex';

/**
 * RoomProfiles listens to controlled character models and their rooms, fetching
 * a list of available room profiles.
 */
class RoomProfiles {
	constructor(app, params) {
		this.app = app;

		// Bind callbacks
		this._onCtrlChange = this._onCtrlChange.bind(this);
		this._onCharChange = this._onCharChange.bind(this);
		this._onRoomChange = this._onRoomChange.bind(this);

		this.app.require([
			'player',
			'api',
		], this._init.bind(this));
	}

	_init(module) {
		this.module = module;

		this.chars = {};
		this.rooms = {};
		this.roomsProfiles = new Model({ eventBus: this.app.eventBus });
		this.ctrlModel = this.module.player.getControlledModel();

		this.inRoomProfiles = new TokenList(() => {
			let c = this.module.player.getActiveChar();
			return (c && this.roomsProfiles.props[c.inRoom.id]?.toArray()) || [];
		}, {
			regex: keyTokenRegex,
			expandRegex: keyExpandRegex,
			isMatch: (t, key) => key === t.key ? { key, value: t.id } : false,
			isPrefix: (t, prefix) => !prefix || t.key.substring(0, prefix.length) === prefix
				? t.key
				: null,
		});

		this._listenCtrl(true);
	}

	getInRoomProfileTokens() {
		return this.inRoomProfiles;
	}

	_listenCtrl(on) {
		let cb = on ? 'on' : 'off';
		this.ctrlModel[cb]('change', this._onCtrlChange);
		if (on) {
			this._onCtrlChange();
		}
	}

	_onCtrlChange(ev) {
		if (!this.rooms) return;
		this._listenChars(objectKeyDiff(this.chars, this.ctrlModel?.props));
	}

	_listenChars(change) {
		for (let charId in change) {
			let char = change[charId];
			if (char) {
				char.on('change', this._onCharChange);
				this.chars[charId] = char;
			} else {
				char = this.chars[charId];
				char.off('change', this._onCharChange);
				delete this.chars[charId];
			}
		}
		this._onCharChange();
	}

	_onCharChange() {
		if (!this.rooms) return;

		let rooms = {};
		for (let charId in this.chars) {
			let room = this.chars[charId].inRoom;
			rooms[room.id] = room;
		}
		this._listenRooms(objectKeyDiff(this.rooms, rooms));
	}

	_listenRooms(change) {
		for (let roomId in change) {
			let room = change[roomId];
			if (room) {
				room.on('change', this._onRoomChange);
				this.rooms[roomId] = room;
			} else {
				room = this.rooms[roomId];
				room.off('change', this._onRoomChange);
				delete this.rooms[roomId];
			}
		}
		this._onRoomChange();
	}

	_onRoomChange() {
		if (!this.rooms) return;

		let editableRooms = {};
		for (let roomId in this.rooms) {
			let room = this.rooms[roomId];
			for (let char in this.chars) {
				if (this.canSetRoomProfile(char, room)) {
					editableRooms[roomId] = true;
				}
			}
		}

		let change = objectKeyDiff(this.roomsProfiles, editableRooms);
		if (!Object.keys(change)) {
			return;
		}

		let update = {};
		for (let roomId in change) {
			// On new roomProfiles
			if (change[roomId]) {
				update[roomId] = null;
				this.module.api.get('core.room.' + roomId + '.profiles').then(profiles => {
					if (this.roomsProfiles?.props.hasOwnProperty(roomId)) {
						profiles.on();
						this.roomsProfiles.set({ [roomId]: profiles });
					}
				});
			// On removed roomProfiles
			} else {
				update[roomId] = undefined;
				this.roomsProfiles.props[roomId]?.off();
			}
		}
		this.roomsProfiles.set(update);
	}

	/**
	 * Checks if a controlled character can set room profile.
	 * @param {Model} ctrl Controlled character model.
	 * @param {Model} room Room model.
	 * @returns {boolean} True if allowed to set room profile, otherwise false.
	 */
	canSetRoomProfile(ctrl, room) {
		return !ctrl.puppeteer && (this.module.player.isBuilder() || (room.owner && room.owner.id == ctrl.id));
	}

	dispose() {
		for (let roomId in this.roomsProfiles) {
			this.roomsProfiles[roomId].off();
		}
		for (let roomId in this.rooms) {
			this.rooms[roomId].off('change', this._onRoomChange);
		}
		for (let charId in this.chars) {
			this.chars[charId].off('change', this._onCharChange);
		}
		this.roomsProfiles = null;
		this.rooms = null;
		this.chars = null;
		this._listenPlayer(false);
	}
}

export default RoomProfiles;
