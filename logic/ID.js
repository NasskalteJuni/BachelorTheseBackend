/**
 * @function
 * generate a new, unique, randomly alphanumeric ID
 * */
module.exports = function(){
    const time_component = new Date().getTime().toString(32);
    const random_component = Math.random().toString(32).substr(2,7);
    const random_component_2 = Math.random().toString(32).substr(2,7);
    // since we bind our random id to a time value, collisions can only happen when id is called directly after another.
    // and then, the random values should not collide (at least this is not probable and quite sure not to happen)
    return time_component + random_component + random_component_2;
};