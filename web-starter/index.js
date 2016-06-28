'use strict';
var generators = require('yeoman-generator'), 
  _ = require('lodash'),
  Promise = require('bluebird'),
  rp = require('request-promise'),
  semver = require('semver'),
  glob = Promise.promisify(require('glob')),
  pkg = require('../package.json'),
  ygp = require('yeoman-generator-bluebird');

module.exports = generators.Base.extend({
  initializing : {
    async : function() {
      ygp(this);
      this.options.addDevDependency(pkg.name, '~' + pkg.version);
    },
    platform : function() {
      // Set the platform
      this.options.parent.answers.platform = 'wordpress';
    }
  },
  prompting : function() {
    var that = this;
    
    var config = _.extend({
      wp_cfm : false,
      wordpress_theme : '',
      wp_version : ''
    }, this.config.getAll());
    
    return rp({ 
      url : 'https://api.github.com/repos/WordPress/WordPress/tags',
      headers : {
        'User-Agent' : 'generator-web-starter-wordpress',
      }
    }).then(function(response) {
      var tags = _.chain(JSON.parse(response))
        .orderBy('name', 'desc')
        .map(function(tag) {
          var name = tag.name;
          
          if (!semver.valid(name)) {
            name = name + '.0';
          }
          
          tag.release = semver.major(name) + '.' + semver.minor(name);
          
          return tag;
        })
        .groupBy('release')
        .map(function(release) {
          return release.shift();
        })
        .map(function(tag) {
          return tag.name;
        })
        .value();
      
      // If we have an existing version ensure it's available in the list
      if (!_.isEmpty(config.wp_version) && !_.find(tags, config.wp_version)) {
        tags.push(config.wp_version);
        _.reverse(tags.sort());
      }
      else if (_.isEmpty(config.wp_version)) {
        config.wp_version = tags[0];
      }
      
      return Promise.resolve(tags);
    }).then(function(tags) {
      return that.prompt([{
        type : 'list',
        name : 'wp_version',
        choices : tags,
        message : 'Select a version of WordPress',
        default : config.wp_version,
      },
      {
        type: 'confirm',
        name: 'wp_cfm',
        message: 'Does it use the WP-CFM plugin?',
        default: config.wp_cfm,
      },
      {
        type: 'input',
        name: 'wordpress_theme',
        message: 'Theme name (machine name)',
        default: config.wordpress_theme,
      },
      {
        type: 'confirm',
        name: 'install_wordpress',
        message: 'Install a fresh copy of WordPress?',
        default: false,
      }]);
    }).then(function(answers) {
      that.config.set(answers);

      // Expose the answers on the parent generator
      _.extend(that.options.parent.answers, { 'web-starter-wordpress' : answers });
    });
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
      this.options.parent.answers.theme_path = 'public/wp-content/themes/' + this.options.parent.answers['web-starter-wordpress'].wordpress_theme;
      this.options.parent.answers.build_path = 'public/wp-content/themes/' + this.options.parent.answers['web-starter-wordpress'].wordpress_theme;
    }
  },
  writing : {
    /**
     * Installs latest version
     */
    wordpress : function() {
      var that = this;
      var config = this.config.getAll();

      if (config.install_wordpress) {
        // Create a Promise for remote downloading
        return this.remoteAsync('WordPress', 'WordPress', config.wp_version)
        .bind({})
        .then(function(remote) {
          this.remotePath = remote.cachePath;
          return glob('**', { cwd : remote.cachePath });
        })
        .then(function(files) {
          var remotePath = this.remotePath;
          
          _.each(files, function(file) {
            that.fs.copy(
              remotePath + '/' + file,
              that.destinationPath('public/' + file)
            );
          });
        });
      }
    },
    
    settings : function() {
      // Get current system config for this sub-generator
      var config = this.options.parent.answers['web-starter-wordpress'];
      _.extend(config, this.options.parent.answers);
      
      this.fs.copyTpl(
        this.templatePath('public/wp-config.vm.php'),
        this.destinationPath('public/wp-config.vm.php'),
        config
      );
    }
  }
});
