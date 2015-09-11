'use strict';
var generators = require('yeoman-generator'), 
  _ = require('lodash');

module.exports = generators.Base.extend({
  prompting : function() {
    var done = this.async();
    var config = _.extend({
      wp_cfm : false,
      wordpress_theme : ''
    }, this.config.getAll());

    this.prompt([{
      type: 'confirm',
      name: 'wp_cfm',
      message: 'Does it use the WP-CFM plugin?',
      default: config.wp_cfm,
    },
    {
      type: 'input',
      name: 'wordpress_theme',
      message: 'Theme name',
      default: config.wordpress_theme,
    }], function (answers) {
      this.config.set(answers);
      
      // Expose the answers on the parent generator
      _.extend(this.options.parent.answers, { 'web-starter-wordpress' : answers });
      
      // Set the platform
      this.options.parent.answers.platform = 'wordpress';
      
      done();
    }.bind(this));
  },
  configuring : {
    addCapistrano : function() {
      var config = this.config.getAll();
      
      // If we're using Capistrano set some additional values
      if (_.has(this.options.parent.answers, 'web-starter-capistrano')) {
        _.extend(this.options.parent.answers['web-starter-capistrano'].config, {
          wordpress_wpcfm : config.wp_cfm,
          linked_dirs : '%w[public/wp-content/uploads public/wp-content/upgrade]'
        });
      }
    },
    setThemePath : function() {
      this.options.parent.answers.theme_gemfile = 'wp-content/themes/' + this.options.parent.answers['web-starter-wordpress'].wordpress_theme + '/Gemfile';
    }
  },
  writing : {
    settings : function() {
      var done = this.async();
      
      // Get current system config for this sub-generator
      var config = this.options.parent.answers['web-starter-wordpress'];
      _.extend(config, this.options.parent.answers);
      
      this.fs.copyTpl(
        this.templatePath('public/wp-config.vm.php'),
        this.destinationPath('public/wp-config.vm.php'),
        config
      );
      
      done();
    }
  }
});
