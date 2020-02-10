const Sequelize = require('sequelize');
const DB = require('./orm.js');
class User extends Sequelize.Model {
    toJSON(){
        return {
            id: this.id,
            name: this.name,
            lastLogin: this.lastLogin,
            created: this.created
        }
    }
}

User.init({
    id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    password: {
        type: Sequelize.STRING,
        allowNull: false
    },
    lastLogin: {
        type: Sequelize.DATE,
    },
    created: {
        type: Sequelize.DATE,
        allowNull: false
    }
},{
    sequelize: DB,
    timestamps: false,
    modelName: 'user'
});

module.exports = User;