const HttpStatus = require('../errors/http-status');
const APIError = require('../errors/api-error');
const { validationResult } = require('express-validator');
const UserService = require('../services/user-service');
const Pagination = require('../libs/pagination');

class UserController {
    static userService = new UserService();

    async listAll(req, res, next) {
        UserController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await UserController.getPermissions(req);

        const filter = Pagination.getFilter(req.query);
        if (req.query.name) 
            filter.name = req.query.name;

        const json = !permissionOnlyHimself
            ? Pagination.getPagingData(await UserController.userService.findAll(filter), filter.page, filter.size)
            : Pagination.getPagingDataForSingle(loggedUser, filter.page, filter.size);

        res.json(json);
        next();
    }

    async findById(req, res, next) {
        UserController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await UserController.getPermissions(req, false);
        const requestedId = parseInt(req.params.id);

        if (permissionOnlyHimself) {
            if (loggedUser.id !== requestedId) 
                throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'user.not-have-privileges-to-another-user-data');     
            if (loggedUser.pendingPassword)
                throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'auth.pendant-change-temporary-password');

            res.json(loggedUser);
            return next(res);
        }

        const requestedUser = await UserController.userService.findById(requestedId);
        if (requestedUser == null) 
            throw new APIError('Not found', HttpStatus.NOT_FOUND, 'user.not-found');

        res.json(requestedUser);
        next();
    }

    async remove(req, res, next) {
        UserController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await UserController.getPermissions(req, false);
        const requestedId = parseInt(req.params.id);

        if (permissionOnlyHimself) {
            if (loggedUser.id !== requestedId) 
                throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'user.not-have-privileges-to-delete-users');     
            if (loggedUser.pendingPassword)
                throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'auth.pendant-change-temporary-password');

            await UserController.userService.remove(loggedUser);
            res.status(HttpStatus.NO_CONTENT).json();
            next(res);
        }
        if (loggedUser.id === requestedId && loggedUser.pendingPassword) 
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'auth.pendant-change-temporary-password');

        const requestedUser = await UserController.userService.findById(requestedId);
        if (requestedUser == null) 
            throw new APIError('Not found', HttpStatus.NOT_FOUND, 'user.not-found');

        await UserController.userService.remove(requestedUser);

        res.status(HttpStatus.NO_CONTENT).json();
        next();
    }

    async create(req, res, next) {
        UserController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await UserController.getPermissions(req);

        if (permissionOnlyHimself) 
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'user.not-have-privileges-to-create-users');     

        const {name, email, password} = req.body;
        const superUser = req.body.super;
        const createdUser = await UserController.userService.save({name, email, password, superUser});

        res.status(HttpStatus.CREATED).json(createdUser);
        next();
    }

    async edit(req, res, next) {
        UserController.validate(req, res);
        const {loggedUser, permissionOnlyHimself, permissionSuper} = await UserController.getPermissions(req);
        const requestedId = parseInt(req.params.id);

        if (permissionOnlyHimself) {
            if (loggedUser.id !== requestedId) {
                throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'user.not-have-privileges-to-edit-users');     
            }
            const {name, email, password} = req.body;
            const editedUser = await UserController.userService.edit(loggedUser, {name, email, password});
            res.status(HttpStatus.OK).json(editedUser);
            return next(res);
        }  

        const userDto = {
            name: req.body.name, 
            email: req.body.email, 
            password: req.body.password, 
            pendingConfirm: req.body.pendingConfirm
        };
        const editedUser = await UserController.userService.editById(requestedId, userDto);

        res.status(HttpStatus.OK).json(editedUser);
        next();
    }

    async promote(req, res, next) {
        UserController.validate(req, res);
        const {loggedUser, permissionSuper} = await UserController.getPermissions(req);

        if (!permissionSuper)
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'user.not-have-privileges-to-promote-users');  
        
        const requestedId = parseInt(req.params.id);
        if (loggedUser.id === requestedId)
            throw new APIError('Bad Request', HttpStatus.BAD_REQUEST, 'user.not-have-privileges-to-promote-yourself'); 
            
        const user = await UserController.userService.promote(requestedId);

        const response = {
            message: res.__('user.promotion-successfully'),
            user
        }
        res.status(HttpStatus.OK).json(response);
        next();
    }

    static async getPermissions(req, blockChangePassword = true) {
        const loggedUserId = req.userId; 
        const loggedUser = await UserController.userService.findById(loggedUserId);
        if (loggedUser == null) 
            throw new APIError('Unauthorized', HttpStatus.UNAUTHORIZED, 'auth.logged-user-not-found');

        if (blockChangePassword && loggedUser.pendingPassword)
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'auth.pendant-change-temporary-password');

        const permissions = {
            loggedUser,
            permissionOnlyHimself: ((!loggedUser.super) || (loggedUser.super && loggedUser.pendingConfirm)),
            permissionSuper: (loggedUser.super && !loggedUser.pendingConfirm)
        };
        return permissions;
    }

    static validate(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) 
          return res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({errors: errors.array()});
    }
}

module.exports = UserController;