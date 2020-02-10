const PersistedUser = require('../persistence/User.js');
const bcrypt = require("bcrypt");
const hashRounds = require("../config.js").persistence.hashRounds || 10;

class User extends PersistedUser{

    constructor(){
        super(...arguments);
    }

    static byId(id, iterable){
        return User.byAttribute("id", id, iterable);
    }

    static byName(name, iterable){
        return User.byAttribute("name", name, iterable)
    }

    static byAttribute(attr, value, iterable){
        return iterable.reduce((found, user) => user[attr] === value ? user : found, null);
    }

    static async create(values, createOptions){
        values["password"] = await bcrypt.hash(values["password"], hashRounds);
        values["created"] = values["created"] || new Date();
        values["lastLogin"] = values["lastLogin"] || null;
        return super.create(values, createOptions);
    }

    /**
     * check a given password against the database
     * @param password [string] the plain text password to check against the stored hashed version
     * @returns boolean true, when the password matches and false otherwise
     * */
    async isPasswordValid(password){
        return await bcrypt.compare(password, this.password)
    }

    /**
     * updates the last login value of the user
     * @param date [Date=current date] the last time the user logged in, defaults to the current time
     * */
    async updateLastLogin(date = new Date()){
        this.lastLogin = date;
        await this.save();
    }

    async updatePassword(newPassword){
        this.password = await bcrypt.hash(newPassword, hashRounds);
        await this.save();
    }
}

module.exports = User;